#!/bin/bash
# Load testing script for upload-service using Locust

set -e

# Configuration
TARGET_HOST="${TARGET_HOST:-http://localhost:8080}"
USERS="${USERS:-100}"
SPAWN_RATE="${SPAWN_RATE:-10}"
RUN_TIME="${RUN_TIME:-5m}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Upload Service Load Test${NC}"
echo "========================"
echo "Target: $TARGET_HOST"
echo "Users: $USERS"
echo "Spawn Rate: $SPAWN_RATE users/second"
echo "Duration: $RUN_TIME"
echo ""

# Navigate to service directory
cd "$(dirname "$0")/.."

# Check if locust is installed
if ! command -v locust &> /dev/null; then
    echo "Installing locust..."
    pip install locust
fi

# Check if locustfile exists
if [ ! -f "tests/load/locustfile.py" ]; then
    echo "Error: tests/load/locustfile.py not found"
    exit 1
fi

# Run load test
echo "Starting load test..."
echo "Press Ctrl+C to stop"
echo ""

locust \
    -f tests/load/locustfile.py \
    --headless \
    --users "$USERS" \
    --spawn-rate "$SPAWN_RATE" \
    --run-time "$RUN_TIME" \
    --host "$TARGET_HOST" \
    --html reports/load-test-report.html \
    --csv reports/load-test-stats

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}Load test completed!${NC}"
    echo "Report generated at: reports/load-test-report.html"
    echo "CSV stats at: reports/load-test-stats.csv"
else
    echo "Load test failed or was interrupted"
    exit 1
fi
