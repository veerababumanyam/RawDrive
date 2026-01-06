#!/bin/bash
# Test gallery microservice integration

set -e

BASE_URL="http://localhost"
echo "Testing Gallery Microservice Integration"
echo "========================================="
echo ""

echo "1. Testing health endpoint (direct)..."
if curl -f -s "$BASE_URL:8004/health" > /dev/null 2>&1; then
    echo "   ✓ Health check passed"
else
    echo "   ✗ Health check failed"
fi
echo ""

echo "2. Testing Traefik routing (via gateway)..."
if curl -f -s "$BASE_URL/api/v1/galleries/../health" > /dev/null 2>&1; then
    echo "   ✓ Routing works"
else
    echo "   ✗ Routing failed (gallery service may not be running)"
fi
echo ""

echo "3. Testing metrics endpoint..."
if curl -f -s "$BASE_URL:8004/metrics" | head -n 5 > /dev/null 2>&1; then
    echo "   ✓ Metrics available"
    echo ""
    echo "   Sample metrics:"
    curl -s "$BASE_URL:8004/metrics" | grep -E "gallery_|http_" | head -n 5
else
    echo "   ✗ Metrics failed"
fi
echo ""

echo "4. Checking Traefik dashboard..."
if curl -s "http://traefik.localhost:8080/api/http/routers" 2>/dev/null | grep -q "gallery"; then
    echo "   ✓ Traefik routers configured"
else
    echo "   ✗ Routers not found (check Traefik dashboard at http://traefik.localhost:8080)"
fi
echo ""

echo "5. Testing container status..."
if docker ps | grep -q "rawdrive-gallery-service"; then
    echo "   ✓ Gallery service container running"
else
    echo "   ✗ Gallery service container not found"
fi
echo ""

echo "========================================="
echo "Integration tests complete!"
echo ""
echo "Next steps:"
echo "  - Open Traefik dashboard: http://traefik.localhost:8080"
echo "  - View gallery metrics: http://localhost:8004/metrics"
echo "  - Test gallery API: curl http://localhost/api/v1/galleries"
