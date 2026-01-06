#!/bin/bash
# Quick Start Script for Billing Microservice Development (Unix/Mac)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "====================================="
echo "Starting Billing Microservice Stack"
echo "====================================="
echo ""

# Check Docker
echo "Checking Docker..."
if docker version > /dev/null 2>&1; then
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}')
    echo "[OK] Docker is running (version: $DOCKER_VERSION)"
else
    echo "[ERROR] Docker is not responding"
    echo "Please start Docker first"
    exit 1
fi
echo ""

# Check .env file
echo "Checking environment configuration..."
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "[WARNING] .env file not found!"
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
        echo "Creating .env from .env.example..."
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        echo "[OK] .env file created"
    else
        echo "[ERROR] .env.example not found!"
        exit 1
    fi
else
    echo "[OK] .env file exists"
fi
echo ""

# Verify required environment variables
echo "Checking billing-specific environment variables..."
REQUIRED_VARS=("JWT_SECRET" "RAZORPAY_KEY_ID" "RAZORPAY_KEY_SECRET" "RAZORPAY_WEBHOOK_SECRET")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=.\\+" "$PROJECT_ROOT/.env"; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "[WARNING] Missing or empty environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo "Please update .env file with required values"
    echo ""
else
    echo "[OK] Required environment variables configured"
fi
echo ""

# Start services
echo "Starting services with Docker Compose..."
echo "Command: docker compose -f infrastructure/docker/docker-compose.dev.yml up -d"
echo ""

cd "$PROJECT_ROOT"
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d billing-service postgres redis

if [ $? -eq 0 ]; then
    echo ""
    echo "[OK] Services started successfully!"
    echo ""
    echo "Waiting for services to be healthy (15 seconds)..."
    sleep 15

    echo ""
    echo "====================================="
    echo "Services Status"
    echo "====================================="
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAMES|billing|postgres|redis"

    echo ""
    echo "====================================="
    echo "Quick Access Links"
    echo "====================================="
    echo "Billing (direct):   http://localhost:8006/health"
    echo "Billing (Traefik):  http://localhost/api/v1/subscription"
    echo "Metrics:            http://localhost:8006/metrics"
    echo "OpenAPI Docs:       http://localhost:8006/docs"
    echo ""
    echo "====================================="
    echo "Webhook Testing"
    echo "====================================="
    echo "Razorpay:           http://localhost/webhooks/razorpay"
    echo "Stripe:             http://localhost/webhooks/stripe"
    echo ""
    echo "====================================="
    echo "Next Steps"
    echo "====================================="
    echo "1. Run tests: ./scripts/test-billing-setup.sh"
    echo "2. View logs: docker logs rawdrive-billing-service -f"
    echo "3. Test webhook: See README.md for webhook testing examples"
    echo "4. Start Traefik: docker compose -f infrastructure/docker/docker-compose.dev.yml up -d traefik"
    echo ""
else
    echo ""
    echo "[ERROR] Failed to start services"
    echo "Check the error messages above"
    exit 1
fi
