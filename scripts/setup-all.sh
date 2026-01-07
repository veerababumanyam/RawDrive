#!/bin/bash
# Master Setup Script for RawDrive
# Sets up the entire development environment from scratch

set -e

echo "========================================================================="
echo "RawDrive Complete Setup"
echo "========================================================================="
echo ""
echo "This script will:"
echo "  1. Start all Docker services"
echo "  2. Run database migrations"
echo "  3. Seed test users"
echo "  4. Build shared packages"
echo "  5. Setup frontend dependencies"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Step 1: Check prerequisites
echo -e "${GREEN}[1/7] Checking prerequisites...${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found. Please install Docker Desktop.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker installed${NC}"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not found.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose installed${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠ Node.js not found. Frontend setup will be skipped.${NC}"
    SKIP_FRONTEND=true
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js installed ($NODE_VERSION)${NC}"
    SKIP_FRONTEND=false
fi

# Step 2: Start Docker services
echo -e "\n${GREEN}[2/7] Starting Docker services...${NC}"
docker compose -f infrastructure/docker/docker-compose.yml up -d

echo "Waiting for services to be healthy..."
sleep 10

# Check backend health
MAX_ATTEMPTS=30
ATTEMPT=0
BACKEND_READY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if docker ps --filter "name=rawdrive-backend" --format "{{.Status}}" | grep -q "healthy"; then
        BACKEND_READY=true
        echo -e "${GREEN}✓ Backend service is healthy${NC}"
        break
    fi

    ATTEMPT=$((ATTEMPT + 1))
    echo -e "${YELLOW}Waiting for backend... (attempt $ATTEMPT/$MAX_ATTEMPTS)${NC}"
    sleep 3
done

if [ "$BACKEND_READY" = false ]; then
    echo -e "${RED}✗ Backend service failed to start${NC}"
    echo "Check logs with: docker compose -f infrastructure/docker/docker-compose.yml logs backend"
    exit 1
fi

# Step 3: Install backend dependencies
echo -e "\n${GREEN}[3/7] Installing backend dependencies...${NC}"
docker exec rawdrive-backend pip install --quiet psycopg2-binary || {
    echo -e "${YELLOW}⚠ psycopg2-binary may already be installed${NC}"
}

# Step 4: Run database migrations
echo -e "\n${GREEN}[4/7] Running database migrations...${NC}"
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head" || {
    echo -e "${RED}✗ Migration failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Migrations completed${NC}"

# Step 5: Seed test users
echo -e "\n${GREEN}[5/7] Seeding test users...${NC}"
docker exec -e DATABASE_URL="postgresql://rawdrive:rawdrive@postgres:5432/rawdrive" \
    rawdrive-backend python seed_all_test_users.py || {
    echo -e "${YELLOW}⚠ Test user seeding may have failed${NC}"
}

# Step 6: Build shared packages
if [ "$SKIP_FRONTEND" = false ]; then
    echo -e "\n${GREEN}[6/7] Building shared packages...${NC}"
    bash "$SCRIPT_DIR/setup-frontend.sh" || {
        echo -e "${YELLOW}⚠ Frontend setup had issues${NC}"
    }
else
    echo -e "\n${YELLOW}[6/7] Skipping frontend setup (Node.js not available)${NC}"
fi

# Step 7: Health checks
echo -e "\n${GREEN}[7/7] Running health checks...${NC}"

# Check services
SERVICES=(
    "rawdrive-backend:8000"
    "rawdrive-postgres:5432"
    "rawdrive-redis:6379"
)

for service in "${SERVICES[@]}"; do
    SERVICE_NAME=$(echo $service | cut -d: -f1)
    PORT=$(echo $service | cut -d: -f2)

    if docker ps --filter "name=$SERVICE_NAME" --format "{{.Names}}" | grep -q "$SERVICE_NAME"; then
        echo -e "${GREEN}✓ $SERVICE_NAME is running${NC}"
    else
        echo -e "${RED}✗ $SERVICE_NAME is not running${NC}"
    fi
done

# Summary
echo -e "\n${GREEN}=========================================================================${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}=========================================================================${NC}"
echo ""
echo "Services are running:"
echo -e "  Backend API:     ${GREEN}http://localhost:8000${NC}"
echo -e "  Frontend:        ${GREEN}http://localhost:5173${NC} (run: cd frontend && pnpm dev)"
echo -e "  Traefik:         ${GREEN}http://localhost:8080${NC}"
echo -e "  Grafana:         ${GREEN}http://localhost:3000${NC} (admin/admin)"
echo ""
echo "Test Users (password: Test@123):"
echo -e "  ${GREEN}free@test.rawdrive.in${NC}"
echo -e "  ${GREEN}business@test.rawdrive.in${NC}"
echo -e "  ${GREEN}enterprise@test.rawdrive.in${NC}"
echo ""
echo "Documentation:"
echo -e "  ${GREEN}docs/DOCKER_QUICK_START.md${NC}"
echo -e "  ${GREEN}CLAUDE.md${NC}"
echo ""
