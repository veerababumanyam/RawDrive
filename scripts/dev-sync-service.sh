#!/bin/bash
# Start sync service for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVICE_DIR="$PROJECT_ROOT/services/sync-service"

echo "Starting Sync Service for local development..."

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "Error: .env file not found. Copy .env.example and configure."
    exit 1
fi

# Load environment variables
source "$PROJECT_ROOT/.env"

# Override environment variables for local dev
export DEBUG=true
export LOG_LEVEL=DEBUG
export APP_ENV=development
export HOST=0.0.0.0
export PORT=8007

# Default database URL if not set
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/rawdrive}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"

# Create virtual environment if it doesn't exist
if [ ! -d "$SERVICE_DIR/.venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$SERVICE_DIR/.venv"
fi

# Activate virtual environment
source "$SERVICE_DIR/.venv/bin/activate"

# Install dependencies
echo "Installing dependencies..."
pip install -r "$SERVICE_DIR/requirements.txt" -q

# Change to service directory
cd "$SERVICE_DIR"

# Run the service
echo ""
echo "Starting Sync Service on port ${PORT}..."
echo "API docs available at: http://localhost:${PORT}/docs"
echo ""

python -m uvicorn src.main:app --host ${HOST} --port ${PORT} --reload --log-level debug
