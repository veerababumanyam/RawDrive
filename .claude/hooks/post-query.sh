#!/bin/bash

################################################################################
# PostQuery Hook for GEO Search Analytics Logging
# Purpose: Log search analytics and update caches after each GEO search query
#
# Usage: post-query.sh <query_text> <workspace_id> <user_id> <result_count> <latency_ms>
#
# Parameters:
#   $1: query_text       - Natural language search query
#   $2: workspace_id     - UUID for workspace isolation
#   $3: user_id          - UUID of user making search
#   $4: result_count     - Integer number of results returned
#   $5: latency_ms       - Integer milliseconds for query execution
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

################################################################################
# Configuration and Defaults
################################################################################

# Performance thresholds
P95_THRESHOLD_MS=500
ALERT_THRESHOLD_MS=500

# Logging configuration
HOOK_NAME="post-query"
LOG_LEVEL="${LOG_LEVEL:-INFO}"

################################################################################
# Parameter Validation
################################################################################

validate_inputs() {
    if [[ $# -lt 5 ]]; then
        echo -e "${RED}❌ Error: Missing required parameters${NC}" >&2
        echo "Usage: post-query.sh <query_text> <workspace_id> <user_id> <result_count> <latency_ms>" >&2
        return 1
    fi

    local query_text="$1"
    local workspace_id="$2"
    local user_id="$3"
    local result_count="$4"
    local latency_ms="$5"

    # Validate UUIDs (basic format check)
    if [[ ! "$workspace_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
        echo -e "${YELLOW}⚠️ Warning: workspace_id does not appear to be a valid UUID${NC}" >&2
    fi

    if [[ ! "$user_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
        echo -e "${YELLOW}⚠️ Warning: user_id does not appear to be a valid UUID${NC}" >&2
    fi

    # Validate numeric fields
    if ! [[ "$result_count" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}❌ Error: result_count must be a positive integer${NC}" >&2
        return 1
    fi

    if ! [[ "$latency_ms" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}❌ Error: latency_ms must be a positive integer${NC}" >&2
        return 1
    fi

    # Validate query text is not empty
    if [[ -z "$query_text" ]]; then
        echo -e "${RED}❌ Error: query_text cannot be empty${NC}" >&2
        return 1
    fi
}

################################################################################
# Database Helper Functions
################################################################################

# Get PostgreSQL connection string from environment or construct default
get_db_connection() {
    if [[ -n "${DATABASE_URL:-}" ]]; then
        echo "$DATABASE_URL"
    else
        # Default to localhost development environment
        echo "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
    fi
}

# Execute SQL with proper error handling
execute_sql() {
    local sql="$1"
    local db_url="$(get_db_connection)"

    # Use psql with error handling
    if ! psql "$db_url" -c "$sql" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️ Warning: Failed to execute query - database may be unavailable${NC}" >&2
        return 1
    fi
    return 0
}

# Check if table exists
table_exists() {
    local table_name="$1"
    local db_url="$(get_db_connection)"

    if psql "$db_url" -t -c "SELECT 1 FROM information_schema.tables WHERE table_name='$table_name'" 2>/dev/null | grep -q 1; then
        return 0
    fi
    return 1
}

################################################################################
# SQL Escaping and Sanitization
################################################################################

# Escape single quotes for PostgreSQL
escape_sql_string() {
    local input="$1"
    # Replace single quotes with two single quotes (PostgreSQL escape)
    echo "${input//\'/\'\'}"
}

# Generate MD5 hash of query text (for query_hash)
generate_query_hash() {
    local query_text="$1"
    if command -v md5sum &> /dev/null; then
        echo -n "$query_text" | md5sum | cut -d' ' -f1
    elif command -v md5 &> /dev/null; then
        echo -n "$query_text" | md5 | tr -d ' '
    else
        # Fallback: use sha256sum if available
        echo -n "$query_text" | sha256sum | cut -d' ' -f1
    fi
}

################################################################################
# Analytics Logging
################################################################################

# Insert search log entry
log_search_analytics() {
    local query_text="$1"
    local workspace_id="$2"
    local user_id="$3"
    local result_count="$4"
    local latency_ms="$5"

    # Escape query text for SQL
    local escaped_query="$(escape_sql_string "$query_text")"

    # Construct SQL INSERT statement
    local sql="INSERT INTO geo_search_logs (query_text, workspace_id, user_id, result_count, latency_ms, cache_hit, created_at)
    VALUES ('$escaped_query', '$workspace_id', '$user_id', $result_count, $latency_ms, false, NOW());"

    # Execute with error handling
    if table_exists "geo_search_logs"; then
        if execute_sql "$sql"; then
            if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
                echo -e "${GREEN}✅ Search logged to geo_search_logs${NC}" >&2
            fi
            return 0
        else
            echo -e "${YELLOW}⚠️ Failed to log search analytics${NC}" >&2
            return 1
        fi
    else
        if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
            echo -e "${YELLOW}⚠️ geo_search_logs table does not exist - skipping analytics logging${NC}" >&2
        fi
        return 0  # Graceful degradation
    fi
}

################################################################################
# Query Embedding Cache Updates
################################################################################

# Update query embedding cache usage stats
update_cache_stats() {
    local query_text="$1"

    # Generate query hash
    local query_hash="$(generate_query_hash "$query_text")"

    # Construct SQL UPDATE statement
    local sql="UPDATE geo_query_embeddings
    SET use_count = use_count + 1, last_used_at = NOW()
    WHERE query_hash = '$query_hash';"

    # Execute with error handling
    if table_exists "geo_query_embeddings"; then
        if execute_sql "$sql"; then
            if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
                echo -e "${GREEN}✅ Cache stats updated for query hash: $query_hash${NC}" >&2
            fi
            return 0
        else
            if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
                echo -e "${YELLOW}⚠️ Failed to update cache stats${NC}" >&2
            fi
            return 0  # Graceful degradation
        fi
    else
        if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
            echo -e "${YELLOW}⚠️ geo_query_embeddings table does not exist - skipping cache update${NC}" >&2
        fi
        return 0  # Graceful degradation
    fi
}

################################################################################
# Performance Monitoring
################################################################################

# Check and alert on slow queries
monitor_performance() {
    local latency_ms="$1"

    if (( latency_ms > ALERT_THRESHOLD_MS )); then
        echo -e "${YELLOW}⚠️ Slow query detected: ${latency_ms}ms (threshold: ${ALERT_THRESHOLD_MS}ms)${NC}" >&2
        return 1
    fi
    return 0
}

# Log performance metrics
log_performance_metrics() {
    local query_text="$1"
    local result_count="$2"
    local latency_ms="$3"

    # Build metrics summary
    local metrics="query='$query_text' results=$result_count latency_ms=$latency_ms"

    if [[ "$LOG_LEVEL" == "DEBUG" ]]; then
        echo -e "${GREEN}📊 Performance metrics: $metrics${NC}" >&2
    fi
}

################################################################################
# Main Execution
################################################################################

main() {
    # Validate inputs
    if ! validate_inputs "$@"; then
        return 1
    fi

    local query_text="$1"
    local workspace_id="$2"
    local user_id="$3"
    local result_count="$4"
    local latency_ms="$5"

    # Log search analytics
    log_search_analytics "$query_text" "$workspace_id" "$user_id" "$result_count" "$latency_ms"

    # Update query embedding cache
    update_cache_stats "$query_text"

    # Monitor performance
    monitor_performance "$latency_ms"
    local perf_status=$?

    # Log performance metrics
    log_performance_metrics "$query_text" "$result_count" "$latency_ms"

    # Output success message
    if [[ $perf_status -eq 0 ]]; then
        echo -e "${GREEN}✅ Search logged: '$query_text' (${result_count} results, ${latency_ms}ms)${NC}"
    else
        echo -e "${YELLOW}✅ Search logged: '$query_text' (${result_count} results, ${latency_ms}ms - exceeds p95 target)${NC}"
    fi

    return 0
}

# Run main function with all arguments
main "$@"
exit $?
