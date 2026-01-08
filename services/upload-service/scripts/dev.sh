#!/bin/bash
# Start upload-service in development mode

set -e

echo "Starting Upload Service in development mode..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/../../.."

# Start upload-service with Docker Compose
docker compose -f infrastructure/docker/docker-compose.yml up -d upload-service

# Wait for service to be healthy
echo "Waiting for upload-service to be healthy..."
sleep 5

# Check health
HEALTH_URL="http://localhost:8080/health"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s "$HEALTH_URL" > /dev/null 2>&1; then
        echo "✅ Upload service is healthy!"
        echo "Service running at http://localhost:8080"
        echo "Metrics available at http://localhost:8080/metrics"
        echo "API docs at http://localhost:8080/docs"
        exit 0
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for health check... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

echo "❌ Upload service failed to start. Check logs with:"
echo "docker compose -f infrastructure/docker/docker-compose.yml logs upload-service"
exit 1
