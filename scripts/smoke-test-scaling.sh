#!/usr/bin/env bash
#
# Smoke Test Script for RawDrive Scaling Infrastructure
#
# This script validates that all scaling-related components are operational.
# Run after deployment or as part of CI/CD pipeline.
#
# Usage: ./scripts/smoke-test-scaling.sh [--base-url URL] [--verbose]
#
# See: specs/024-5k-concurrent-autoscale/tasks.md T076

set -euo pipefail

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --base-url)
            BASE_URL="$2"
            shift 2
            ;;
        --prometheus-url)
            PROMETHEUS_URL="$2"
            shift 2
            ;;
        --verbose|-v)
            VERBOSE="true"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

check_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"

    if [[ "$VERBOSE" == "true" ]]; then
        log_info "Checking $name at $url"
    fi

    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10) || status="000"

    if [[ "$status" == "$expected_status" ]]; then
        log_pass "$name - HTTP $status"
        return 0
    else
        log_error "$name - Expected HTTP $expected_status, got HTTP $status"
        return 1
    fi
}

check_json_field() {
    local name="$1"
    local url="$2"
    local jq_query="$3"
    local expected="$4"

    local result
    result=$(curl -s "$url" --max-time 10 | jq -r "$jq_query" 2>/dev/null) || result=""

    if [[ "$result" == "$expected" ]]; then
        log_pass "$name - $jq_query = $expected"
        return 0
    else
        log_error "$name - Expected $jq_query = $expected, got '$result'"
        return 1
    fi
}

check_latency() {
    local name="$1"
    local url="$2"
    local max_ms="$3"

    local start_time end_time duration_ms
    start_time=$(date +%s%N)
    curl -s -o /dev/null "$url" --max-time 10 || true
    end_time=$(date +%s%N)
    duration_ms=$(( (end_time - start_time) / 1000000 ))

    if [[ $duration_ms -lt $max_ms ]]; then
        log_pass "$name - ${duration_ms}ms (< ${max_ms}ms)"
        return 0
    else
        log_warn "$name - ${duration_ms}ms (> ${max_ms}ms threshold)"
        return 1
    fi
}

# =============================================================================
# Health Checks
# =============================================================================

echo ""
echo "=============================================="
echo "RawDrive Scaling Infrastructure Smoke Test"
echo "=============================================="
echo "Base URL: $BASE_URL"
echo "Prometheus: $PROMETHEUS_URL"
echo "Grafana: $GRAFANA_URL"
echo "=============================================="
echo ""

echo "### Health Endpoints ###"
check_endpoint "Liveness probe" "$BASE_URL/api/v1/live"
check_endpoint "Readiness probe" "$BASE_URL/api/v1/ready"
check_endpoint "Basic health" "$BASE_URL/api/v1/health"
check_endpoint "Detailed health" "$BASE_URL/api/v1/health/detailed"
echo ""

# =============================================================================
# Database Connectivity
# =============================================================================

echo "### Database Connectivity ###"
check_json_field "PostgreSQL health" "$BASE_URL/api/v1/health/detailed" ".dependencies.postgres.healthy" "true"
check_json_field "Redis health" "$BASE_URL/api/v1/health/detailed" ".dependencies.redis.healthy" "true"
echo ""

# =============================================================================
# Connection Pools
# =============================================================================

echo "### Connection Pools ###"

# Check DB pool has free connections
db_pool_idle=$(curl -s "$BASE_URL/api/v1/health/detailed" --max-time 10 | jq -r ".dependencies.postgres.pool.free_size" 2>/dev/null) || db_pool_idle="0"
if [[ "$db_pool_idle" != "null" && "$db_pool_idle" -gt 0 ]]; then
    log_pass "DB pool has free connections - $db_pool_idle idle"
else
    log_warn "DB pool may be saturated - idle: $db_pool_idle"
fi

# Check Redis pool status
redis_status=$(curl -s "$BASE_URL/api/v1/health/detailed" --max-time 10 | jq -r ".dependencies.redis.pool.status" 2>/dev/null) || redis_status=""
if [[ "$redis_status" == "initialized" ]]; then
    log_pass "Redis pool initialized"
else
    log_warn "Redis pool status: $redis_status"
fi
echo ""

# =============================================================================
# Prometheus Metrics
# =============================================================================

echo "### Prometheus Metrics ###"
check_endpoint "Metrics endpoint" "$BASE_URL/api/v1/metrics"

# Check Prometheus is scraping
if curl -s "$PROMETHEUS_URL/api/v1/targets" --max-time 5 > /dev/null 2>&1; then
    log_pass "Prometheus API accessible"

    # Check for key metrics
    http_requests=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=rawdrive_http_requests_total" --max-time 5 | jq -r ".data.result | length" 2>/dev/null) || http_requests="0"
    if [[ "$http_requests" -gt 0 ]]; then
        log_pass "HTTP request metrics present"
    else
        log_warn "No HTTP request metrics found"
    fi

    db_metrics=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=rawdrive_db_pool_connections_active" --max-time 5 | jq -r ".data.result | length" 2>/dev/null) || db_metrics="0"
    if [[ "$db_metrics" -gt 0 ]]; then
        log_pass "DB pool metrics present"
    else
        log_warn "No DB pool metrics found"
    fi
else
    log_warn "Prometheus not accessible at $PROMETHEUS_URL"
fi
echo ""

# =============================================================================
# Grafana
# =============================================================================

echo "### Grafana ###"
if check_endpoint "Grafana API" "$GRAFANA_URL/api/health"; then
    # Check dashboard exists
    dashboard_check=$(curl -s "$GRAFANA_URL/api/search?query=capacity" --max-time 5 2>/dev/null | jq -r "length" 2>/dev/null) || dashboard_check="0"
    if [[ "$dashboard_check" -gt 0 ]]; then
        log_pass "Capacity dashboard found"
    else
        log_warn "Capacity dashboard not found"
    fi
else
    log_warn "Grafana not accessible"
fi
echo ""

# =============================================================================
# Response Time Checks
# =============================================================================

echo "### Response Times ###"
check_latency "Health endpoint latency" "$BASE_URL/api/v1/health" 500
check_latency "Metrics endpoint latency" "$BASE_URL/api/v1/metrics" 1000
echo ""

# =============================================================================
# PgBouncer (if Kubernetes)
# =============================================================================

echo "### PgBouncer Status ###"
pgbouncer_enabled=$(curl -s "$BASE_URL/api/v1/health/detailed" --max-time 10 | jq -r ".dependencies.postgres.pgbouncer.enabled" 2>/dev/null) || pgbouncer_enabled="false"
if [[ "$pgbouncer_enabled" == "true" ]]; then
    log_pass "PgBouncer enabled"
else
    log_info "PgBouncer not enabled (may be direct connection)"
fi
echo ""

# =============================================================================
# Summary
# =============================================================================

echo "=============================================="
echo "SUMMARY"
echo "=============================================="
echo -e "Passed:   ${GREEN}$PASSED${NC}"
echo -e "Failed:   ${RED}$FAILED${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo "=============================================="

if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}SMOKE TEST FAILED${NC}"
    exit 1
elif [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}SMOKE TEST PASSED WITH WARNINGS${NC}"
    exit 0
else
    echo -e "${GREEN}SMOKE TEST PASSED${NC}"
    exit 0
fi
