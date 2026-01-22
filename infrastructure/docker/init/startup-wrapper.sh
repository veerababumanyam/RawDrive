#!/bin/bash
# Universal startup wrapper for all services
# Ensures databases exist and are healthy before starting the service
# Usage: ./startup-wrapper.sh <service-type> <main-command>

set -e

SERVICE_TYPE=${1:-"api"}
shift
MAIN_COMMAND="$@"

POSTGRES_HOST=${POSTGRES_HOST:-postgres}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-rawdrive}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-rawdrive}
POSTGRES_DB=${POSTGRES_DB:-rawdrive}

REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}

MAX_RETRIES=30
RETRY_INTERVAL=2

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[STARTUP]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Wait for PostgreSQL
wait_for_postgres() {
    log_info "Waiting for PostgreSQL at $POSTGRES_HOST:$POSTGRES_PORT..."

    local retries=0
    until [ $retries -ge $MAX_RETRIES ]; do
        if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" 2>/dev/null; then
            log_info "✓ PostgreSQL is accessible"
            return 0
        fi

        retries=$((retries + 1))
        echo -n "."
        sleep $RETRY_INTERVAL
    done

    log_error "PostgreSQL not available after $MAX_RETRIES attempts"
    return 1
}

# Wait for Redis
wait_for_redis() {
    log_info "Waiting for Redis at $REDIS_HOST:$REDIS_PORT..."

    local retries=0
    until [ $retries -ge $MAX_RETRIES ]; do
        if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
            log_info "✓ Redis is accessible"
            return 0
        fi

        retries=$((retries + 1))
        echo -n "."
        sleep $RETRY_INTERVAL
    done

    log_warn "Redis not available after $MAX_RETRIES attempts (optional)"
    return 0
}

# Verify databases exist
verify_databases() {
    log_info "Verifying required databases..."

    # For one-api service, ensure one_api database exists
    if [ "$SERVICE_TYPE" = "one-api" ]; then
        PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -tc \
            "SELECT 1 FROM pg_database WHERE datname = 'one_api'" | grep -q 1 || {
            log_error "one_api database does not exist"
            return 1
        }
        log_info "✓ one_api database exists"
    fi

    log_info "✓ All required databases verified"
    return 0
}

# Main startup sequence
main() {
    log_info "Starting $SERVICE_TYPE service"
    log_info "Command: $MAIN_COMMAND"

    # Always wait for PostgreSQL first
    wait_for_postgres || exit 1

    # Services that need Redis
    case "$SERVICE_TYPE" in
        api|billing|notifications|upload|gallery)
            wait_for_redis
            ;;
    esac

    # Verify databases
    verify_databases || exit 1

    log_info "All checks passed, starting service..."
    exec $MAIN_COMMAND
}

main
