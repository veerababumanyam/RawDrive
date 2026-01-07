#!/bin/bash
# Gallery Service Startup Script
# Loads configuration from .env file

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "Loaded configuration from .env"
else
    echo "Warning: .env file not found, using defaults"
fi

# Set defaults if not in .env
export SERVICE_PORT=${SERVICE_PORT:-8004}
export SERVICE_HOST=${SERVICE_HOST:-0.0.0.0}

echo "Starting gallery-service..."
echo "  Service: ${SERVICE_NAME:-gallery-service}"
echo "  Host: ${SERVICE_HOST}"
echo "  Port: ${SERVICE_PORT}"
echo "  Database: ${DATABASE_URL}"
echo "  Redis: ${REDIS_URL}"
echo "  R2 Endpoint: ${R2_ENDPOINT}"
echo ""

# Start the service using uvicorn with environment variables
python -m uvicorn src.main:app --host "${SERVICE_HOST}" --port "${SERVICE_PORT}" --reload
