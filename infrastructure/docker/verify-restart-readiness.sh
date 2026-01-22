#!/bin/bash
# Verify that all permanent fixes are in place and containers can restart successfully

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Restart Readiness Verification${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

check_file() {
    local file=$1
    local description=$2

    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $description (File not found: $file)"
        ((CHECKS_FAILED++))
    fi
}

check_content() {
    local file=$1
    local pattern=$2
    local description=$3

    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $description"
        ((CHECKS_PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} $description (Pattern not found)"
        ((CHECKS_WARNING++))
    fi
}

check_docker() {
    local container=$1
    local description=$2

    if docker ps -a --format "{{.Names}}" | grep -q "^${container}$"; then
        local status=$(docker ps --format "{{.Status}}" -f "name=^${container}$")
        echo -e "${GREEN}✓${NC} $description (Status: $status)"
        ((CHECKS_PASSED++))
    else
        echo -e "${RED}✗${NC} $description (Container not found)"
        ((CHECKS_FAILED++))
    fi
}

# Check files
echo -e "${BLUE}File Checks:${NC}"
check_file "$SCRIPT_DIR/init/02-create-databases.sql" "Database initialization SQL script"
check_file "$SCRIPT_DIR/init/enable_pgvector.sql" "pgvector initialization script"
check_file "$SCRIPT_DIR/init/startup-wrapper.sh" "Service startup wrapper"
check_file "$SCRIPT_DIR/.env.database" "Database environment variables"
check_file "$SCRIPT_DIR/docker-compose.yml" "Docker compose file"
check_file "$SCRIPT_DIR/docker-compose.permanent-fixes.yml" "Permanent fixes reference"
echo ""

# Check docker-compose configuration
echo -e "${BLUE}Docker Compose Configuration:${NC}"
check_content "$SCRIPT_DIR/docker-compose.yml" "02-create-databases.sql" "Database init script mounted"
check_content "$SCRIPT_DIR/docker-compose.yml" "start_period:" "Health check start periods configured"
check_content "$SCRIPT_DIR/docker-compose.yml" "service_healthy" "Service dependencies on healthy services"
echo ""

# Check running containers
echo -e "${BLUE}Container Status:${NC}"
check_docker "rawdrive-postgres" "PostgreSQL"
check_docker "rawdrive-redis" "Redis"
check_docker "rawdrive-backend" "Backend API"
check_docker "rawdrive-billing-service" "Billing Service"
check_docker "rawdrive-gallery-service" "Gallery Service"
echo ""

# Check database configuration
echo -e "${BLUE}Database Configuration:${NC}"

# Check PostgreSQL max_connections
MAX_CONN=$(docker exec rawdrive-postgres psql -U rawdrive -d postgres -t -c "SHOW max_connections;" 2>/dev/null | xargs)
if [ "$MAX_CONN" -ge 200 ]; then
    echo -e "${GREEN}✓${NC} PostgreSQL max_connections ($MAX_CONN >= 200)"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} PostgreSQL max_connections is $MAX_CONN (recommend >= 200)"
    ((CHECKS_WARNING++))
fi

# Check databases exist
if docker exec rawdrive-postgres psql -U rawdrive -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'one_api'" 2>/dev/null | grep -q 1; then
    echo -e "${GREEN}✓${NC} one_api database exists"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}✗${NC} one_api database not found"
    ((CHECKS_FAILED++))
fi

if docker exec rawdrive-postgres psql -U rawdrive -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'rawdrive'" 2>/dev/null | grep -q 1; then
    echo -e "${GREEN}✓${NC} rawdrive database exists"
    ((CHECKS_PASSED++))
else
    echo -e "${RED}✗${NC} rawdrive database not found"
    ((CHECKS_FAILED++))
fi

# Check extensions
if docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -tc "SELECT 1 FROM pg_extension WHERE extname = 'vector'" 2>/dev/null | grep -q 1; then
    echo -e "${GREEN}✓${NC} pgvector extension installed"
    ((CHECKS_PASSED++))
else
    echo -e "${YELLOW}⚠${NC} pgvector extension not installed (optional)"
    ((CHECKS_WARNING++))
fi

echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "Passed:   ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Warnings: ${YELLOW}$CHECKS_WARNING${NC}"
echo -e "Failed:   ${RED}$CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Your system is ready for restarts.${NC}"
    echo ""
    echo "Test with:"
    echo "  docker compose down"
    echo "  docker compose up -d"
    echo "  docker ps --format 'table {{.Names}}\t{{.Status}}'"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the items marked with ✗${NC}"
    exit 1
fi
