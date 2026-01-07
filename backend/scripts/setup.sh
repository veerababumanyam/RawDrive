#!/bin/bash
# Backend Setup Script
# Ensures all dependencies, migrations, and data are properly initialized

set -e  # Exit on any error

echo "========================================================================="
echo "RawDrive Backend Setup"
echo "========================================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running in Docker
if [ -f /.dockerenv ]; then
    IN_DOCKER=true
else
    IN_DOCKER=false
fi

# Step 1: Install Python dependencies
echo -e "\n${GREEN}[1/6] Installing Python dependencies...${NC}"
pip install -q --no-cache-dir psycopg2-binary || {
    echo -e "${YELLOW}Warning: psycopg2-binary already installed or failed to install${NC}"
}

# Verify critical dependencies
echo -e "${GREEN}Verifying dependencies...${NC}"
python -c "import asyncpg; print('✓ asyncpg installed')" || {
    echo -e "${RED}Error: asyncpg not installed${NC}"
    exit 1
}

python -c "import psycopg2; print('✓ psycopg2 installed')" || {
    echo -e "${YELLOW}Warning: psycopg2 not installed, attempting to install...${NC}"
    pip install psycopg2-binary
}

python -c "import alembic; print('✓ alembic installed')" || {
    echo -e "${RED}Error: alembic not installed${NC}"
    exit 1
}

# Step 2: Wait for database
echo -e "\n${GREEN}[2/6] Waiting for PostgreSQL...${NC}"
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if python -c "
import asyncpg
import asyncio
import os

async def check_db():
    try:
        db_url = os.getenv('DATABASE_URL', 'postgresql://rawdrive:rawdrive@postgres:5432/rawdrive')
        # Replace asyncpg with postgresql for connection test
        db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')
        conn = await asyncpg.connect(db_url)
        await conn.close()
        return True
    except Exception as e:
        return False

result = asyncio.run(check_db())
exit(0 if result else 1)
" 2>/dev/null; then
        echo -e "${GREEN}✓ Database is ready${NC}"
        break
    fi

    attempt=$((attempt + 1))
    echo -e "${YELLOW}Waiting for database... (attempt $attempt/$max_attempts)${NC}"
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}Error: Database connection timeout${NC}"
    exit 1
fi

# Step 3: Check database extensions
echo -e "\n${GREEN}[3/6] Checking database extensions...${NC}"
python -c "
import asyncpg
import asyncio
import os

async def check_extensions():
    db_url = os.getenv('DATABASE_URL', 'postgresql://rawdrive:rawdrive@postgres:5432/rawdrive')
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

    conn = await asyncpg.connect(db_url)
    try:
        # Check pgvector
        result = await conn.fetchval(\"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='vector')\")
        if result:
            print('✓ pgvector extension enabled')
        else:
            print('⚠ pgvector extension not enabled')

        # Check uuid-ossp
        result = await conn.fetchval(\"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='uuid-ossp')\")
        if result:
            print('✓ uuid-ossp extension enabled')
        else:
            print('⚠ uuid-ossp extension not enabled')
    finally:
        await conn.close()

asyncio.run(check_extensions())
" || echo -e "${YELLOW}Could not verify extensions${NC}"

# Step 4: Run migrations
echo -e "\n${GREEN}[4/6] Running database migrations...${NC}"
cd /app

# Check current migration state
echo "Current migration state:"
alembic current 2>&1 | grep -E "head|[0-9]{4}" || echo "No migrations applied yet"

# Run migrations
echo "Applying migrations..."
alembic upgrade head

# Verify migrations
CURRENT_VERSION=$(alembic current 2>&1 | grep -oE '[0-9]{4}' | tail -1)
if [ -n "$CURRENT_VERSION" ]; then
    echo -e "${GREEN}✓ Migrations applied successfully (current: $CURRENT_VERSION)${NC}"
else
    echo -e "${YELLOW}Warning: Could not verify migration version${NC}"
fi

# Step 5: Seed test users (only in development)
echo -e "\n${GREEN}[5/6] Checking test users...${NC}"
ENV=${ENVIRONMENT:-development}

if [ "$ENV" = "development" ] || [ "$ENV" = "dev" ]; then
    echo "Development environment detected - seeding test users..."

    # Check if users already exist
    USER_COUNT=$(python -c "
import asyncpg
import asyncio
import os

async def count_users():
    db_url = os.getenv('DATABASE_URL', 'postgresql://rawdrive:rawdrive@postgres:5432/rawdrive')
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

    conn = await asyncpg.connect(db_url)
    try:
        count = await conn.fetchval('SELECT COUNT(*) FROM users')
        return count
    finally:
        await conn.close()

print(asyncio.run(count_users()))
" 2>/dev/null || echo "0")

    if [ "$USER_COUNT" -lt 5 ]; then
        echo "Seeding test users..."
        DATABASE_URL=$(echo $DATABASE_URL | sed 's/postgresql+asyncpg/postgresql/') python seed_all_test_users.py 2>&1 | grep -E "✓|Created|Summary" || {
            echo -e "${YELLOW}Warning: Test user seeding may have failed${NC}"
        }
    else
        echo -e "${GREEN}✓ Test users already exist ($USER_COUNT users found)${NC}"
    fi
else
    echo -e "${YELLOW}Production environment - skipping test user seeding${NC}"
fi

# Step 6: Health check
echo -e "\n${GREEN}[6/6] Running health checks...${NC}"

# Check tables exist
python -c "
import asyncpg
import asyncio
import os

async def check_tables():
    db_url = os.getenv('DATABASE_URL', 'postgresql://rawdrive:rawdrive@postgres:5432/rawdrive')
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

    conn = await asyncpg.connect(db_url)
    try:
        tables = ['users', 'workspaces', 'sessions', 'galleries', 'assets']
        for table in tables:
            exists = await conn.fetchval(f\"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='{table}')\")
            if exists:
                print(f'✓ {table} table exists')
            else:
                print(f'✗ {table} table missing')
                return False
        return True
    finally:
        await conn.close()

result = asyncio.run(check_tables())
exit(0 if result else 1)
" || {
    echo -e "${RED}Error: Required tables missing${NC}"
    exit 1
}

echo -e "\n${GREEN}=========================================================================${NC}"
echo -e "${GREEN}✅ Backend setup complete!${NC}"
echo -e "${GREEN}=========================================================================${NC}"
