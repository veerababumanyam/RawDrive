#!/bin/bash
# Health check script for upload-service

set -e

# Configuration
SERVICE_URL="${SERVICE_URL:-http://localhost:8080}"
TIMEOUT="${TIMEOUT:-5}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Upload Service Health Check"
echo "============================"
echo "Service URL: $SERVICE_URL"
echo ""

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local name=$2
    local url="$SERVICE_URL$endpoint"

    if curl -f -s -m "$TIMEOUT" "$url" > /dev/null; then
        echo -e "${GREEN}✅ $name${NC} - $url"
        return 0
    else
        echo -e "${RED}❌ $name${NC} - $url"
        return 1
    fi
}

# Track failures
FAILURES=0

# Check basic health
if ! check_endpoint "/health" "Basic Health"; then
    FAILURES=$((FAILURES + 1))
fi

# Check liveness probe
if ! check_endpoint "/health/live" "Liveness Probe"; then
    FAILURES=$((FAILURES + 1))
fi

# Check readiness probe
if ! check_endpoint "/health/ready" "Readiness Probe"; then
    FAILURES=$((FAILURES + 1))
fi

# Check metrics endpoint
if ! check_endpoint "/metrics" "Metrics Endpoint"; then
    FAILURES=$((FAILURES + 1))
fi

# Check API docs
if ! check_endpoint "/docs" "API Documentation"; then
    FAILURES=$((FAILURES + 1))
fi

echo ""
echo "============================"

if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}All health checks passed!${NC}"
    exit 0
else
    echo -e "${RED}$FAILURES health check(s) failed${NC}"
    echo "Check service logs for details"
    exit 1
fi
