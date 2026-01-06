#!/bin/bash
# Start gallery service for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Starting Gallery Service for local development..."

# Check if .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "Error: .env file not found. Copy .env.example and configure."
    exit 1
fi

# Build gallery service
echo "Building gallery service..."
docker compose -f "$PROJECT_ROOT/infrastructure/docker/docker-compose.dev.yml" build gallery-service

# Start dependencies
echo "Starting dependencies (PostgreSQL, Redis)..."
docker compose -f "$PROJECT_ROOT/infrastructure/docker/docker-compose.dev.yml" up -d postgres redis

# Wait for dependencies
echo "Waiting for dependencies..."
sleep 5

# Start gallery service
echo "Starting gallery service..."
docker compose -f "$PROJECT_ROOT/infrastructure/docker/docker-compose.dev.yml" up -d gallery-service

# Show logs
echo ""
echo "Gallery service started! Logs:"
docker compose -f "$PROJECT_ROOT/infrastructure/docker/docker-compose.dev.yml" logs -f gallery-service
