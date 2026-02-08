#!/bin/bash

# RawDrive GEO Search Service Initialization Hook
# Validates and initializes GEO search infrastructure
# Output: JSON status for Claude Code system integration

set -euo pipefail

# Initialize status tracking
declare -A component_status
declare -A component_details
exit_code=0

# Color codes for output (optional - will be stripped in JSON)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================================
# 1. Validate Milvus Vector Database Connection
# ============================================================================
validate_milvus() {
    local milvus_health_url="http://localhost:19530/health"

    if response=$(curl -s --max-time 5 "$milvus_health_url" 2>/dev/null); then
        if echo "$response" | grep -q "ok\|healthy" 2>/dev/null; then
            component_status["milvus"]="success"
            component_details["milvus"]="Milvus vector database is healthy and accessible"
            return 0
        fi
    fi

    # Fallback: try basic connectivity
    if timeout 3 bash -c "echo > /dev/tcp/localhost/19530" 2>/dev/null; then
        component_status["milvus"]="success"
        component_details["milvus"]="Milvus vector database port (19530) is accessible"
        return 0
    fi

    component_status["milvus"]="warning"
    component_details["milvus"]="Milvus vector database (localhost:19530) is not accessible. Ensure Docker services are running."
    return 1
}

# ============================================================================
# 2. Validate Gemini API Credentials
# ============================================================================
validate_gemini_api() {
    if [[ -z "${GEMINI_API_KEY:-}" ]]; then
        component_status["gemini_api"]="warning"
        component_details["gemini_api"]="GEMINI_API_KEY environment variable is not set. AI features will be disabled."
        return 1
    fi

    # Check if key has minimum length (Gemini keys are typically 39+ chars)
    if [[ ${#GEMINI_API_KEY} -lt 20 ]]; then
        component_status["gemini_api"]="warning"
        component_details["gemini_api"]="GEMINI_API_KEY appears invalid (too short). Please verify configuration."
        return 1
    fi

    component_status["gemini_api"]="success"
    component_details["gemini_api"]="Gemini API credentials are configured and valid"
    return 0
}

# ============================================================================
# 3. Verify PostgreSQL geo_search_logs Table Exists
# ============================================================================
validate_postgresql_geo_search() {
    local db_url="${DATABASE_URL:-postgresql://localhost:5432/rawdrive}"

    # Parse connection string
    if ! command -v psql &> /dev/null; then
        component_status["postgresql_geo"]="warning"
        component_details["postgresql_geo"]="psql client not available. Skipping table validation."
        return 1
    fi

    # Test query with timeout
    if timeout 5 psql "$db_url" -c "SELECT 1 FROM geo_search_logs LIMIT 1;" &>/dev/null; then
        component_status["postgresql_geo"]="success"
        component_details["postgresql_geo"]="PostgreSQL geo_search_logs table exists and is accessible"
        return 0
    fi

    # Check if table exists (migration might not have run)
    if timeout 5 psql "$db_url" -c "SELECT 1 FROM information_schema.tables WHERE table_name='geo_search_logs';" 2>&1 | grep -q "1 row"; then
        component_status["postgresql_geo"]="success"
        component_details["postgresql_geo"]="PostgreSQL geo_search_logs table exists (empty or not yet populated)"
        return 0
    fi

    component_status["postgresql_geo"]="warning"
    component_details["postgresql_geo"]="PostgreSQL geo_search_logs table does not exist. Run migrations: alembic upgrade head"
    return 1
}

# ============================================================================
# 4. Preload Top 10 Popular Query Embeddings from Cache
# ============================================================================
preload_query_embeddings() {
    local db_url="${DATABASE_URL:-postgresql://localhost:5432/rawdrive}"

    if ! command -v psql &> /dev/null; then
        component_status["embedding_cache"]="warning"
        component_details["embedding_cache"]="psql client not available. Skipping cache preload."
        return 1
    fi

    # Query top 10 popular queries
    if timeout 5 psql "$db_url" -t -c \
        "SELECT query_hash FROM geo_query_embeddings ORDER BY use_count DESC LIMIT 10;" \
        &>/dev/null; then

        local count=$(timeout 5 psql "$db_url" -t -c \
            "SELECT COUNT(*) FROM geo_query_embeddings;" 2>/dev/null | tr -d ' ' || echo "0")

        if [[ "$count" -gt 0 ]]; then
            component_status["embedding_cache"]="success"
            component_details["embedding_cache"]="Preloaded top $count query embeddings from cache"
            return 0
        fi
    fi

    component_status["embedding_cache"]="warning"
    component_details["embedding_cache"]="geo_query_embeddings table is empty. Cache will populate during first searches."
    return 1
}

# ============================================================================
# Main Execution
# ============================================================================

# Run all validations
validate_milvus || true
validate_gemini_api || true
validate_postgresql_geo_search || true
preload_query_embeddings || true

# ============================================================================
# Output JSON Status for Claude Code Integration
# ============================================================================

# Count statuses
success_count=$(printf '%s\n' "${component_status[@]}" | grep -c "success" || true)
warning_count=$(printf '%s\n' "${component_status[@]}" | grep -c "warning" || true)

# Determine overall status
overall_status="success"
if [[ $warning_count -gt 2 ]]; then
    overall_status="warning"
fi

# Build JSON output
cat > /tmp/geo_search_hook_output.json << JSON
{
  "hookSpecificOutput": {
    "geoSearchInitialization": {
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "overallStatus": "$overall_status",
      "componentsSummary": {
        "successful": $success_count,
        "warnings": $warning_count,
        "total": ${#component_status[@]}
      }
    }
  },
  "additionalContext": {
    "components": {
      "milvus": {
        "status": "${component_status[milvus]:-unknown}",
        "message": "${component_details[milvus]:-No status available}"
      },
      "geminiApi": {
        "status": "${component_status[gemini_api]:-unknown}",
        "message": "${component_details[gemini_api]:-No status available}"
      },
      "postgresqlGeoSearch": {
        "status": "${component_status[postgresql_geo]:-unknown}",
        "message": "${component_details[postgresql_geo]:-No status available}"
      },
      "embeddingCache": {
        "status": "${component_status[embedding_cache]:-unknown}",
        "message": "${component_details[embedding_cache]:-No status available}"
      }
    },
    "environment": {
      "hasGeminiApiKey": "$([ -n "${GEMINI_API_KEY:-}" ] && echo true || echo false)",
      "hasDatabaseUrl": "$([ -n "${DATABASE_URL:-}" ] && echo true || echo false)",
      "timestamp": "$(date)"
    }
  }
}
JSON

# Display user-friendly output to console
echo ""
echo "=========================================="
echo "GEO Search Service Initialization"
echo "=========================================="
echo ""
echo "Status: $overall_status"
echo ""
echo "Components:"
echo ""

for component in milvus gemini_api postgresql_geo embedding_cache; do
    status="${component_status[$component]:-unknown}"
    message="${component_details[$component]:-No status}"

    if [[ "$status" == "success" ]]; then
        echo -e "${GREEN}✓${NC} $(echo $component | sed 's/_/ /g'): OK"
    else
        echo -e "${YELLOW}⚠${NC} $(echo $component | sed 's/_/ /g'): Check required"
    fi
    echo "  → $message"
    echo ""
done

echo "=========================================="
echo ""

# Output JSON to stdout for Claude Code
cat /tmp/geo_search_hook_output.json

exit 0
