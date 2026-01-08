#!/bin/bash
# Test KEDA autoscaling for upload-service

set -e

# Configuration
NAMESPACE="${NAMESPACE:-default}"
SERVICE_NAME="upload-service"
LOAD_USERS="${LOAD_USERS:-200}"
LOAD_DURATION="${LOAD_DURATION:-10m}"
EXPECTED_MIN_REPLICAS=2
EXPECTED_SCALE_UP=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Testing KEDA Autoscaling for Upload Service${NC}"
echo "=============================================="
echo "Namespace: $NAMESPACE"
echo "Expected min replicas: $EXPECTED_MIN_REPLICAS"
echo "Expected scale-up target: $EXPECTED_SCALE_UP+"
echo ""

# Check initial replica count
echo -e "${YELLOW}Step 1: Checking initial state...${NC}"
INITIAL_REPLICAS=$(kubectl get deployment $SERVICE_NAME -n "$NAMESPACE" -o jsonpath='{.status.replicas}')
echo "Current replicas: $INITIAL_REPLICAS"

if [ "$INITIAL_REPLICAS" -lt "$EXPECTED_MIN_REPLICAS" ]; then
    echo -e "${RED}Warning: Initial replicas below minimum ($EXPECTED_MIN_REPLICAS)${NC}"
fi

# Check KEDA ScaledObject
echo ""
echo -e "${YELLOW}Step 2: Verifying KEDA configuration...${NC}"
if kubectl get scaledobject upload-service-scaling -n "$NAMESPACE" &> /dev/null; then
    echo -e "${GREEN}✅ KEDA ScaledObject exists${NC}"

    # Show current triggers
    echo "Triggers:"
    kubectl get scaledobject upload-service-scaling -n "$NAMESPACE" -o jsonpath='{.spec.triggers[*].type}' | tr ' ' '\n' | sed 's/^/  - /'
else
    echo -e "${RED}❌ KEDA ScaledObject not found${NC}"
    echo "Deploy with: kubectl apply -k services/upload-service/infrastructure/keda/"
    exit 1
fi

# Start load test
echo ""
echo -e "${YELLOW}Step 3: Starting load test...${NC}"
echo "Generating load with $LOAD_USERS users for $LOAD_DURATION"
echo "This will trigger autoscaling..."

# Get service URL (try LoadBalancer, NodePort, or port-forward)
SERVICE_URL=$(kubectl get svc $SERVICE_NAME -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
if [ -z "$SERVICE_URL" ]; then
    # Try port-forward in background
    echo "Setting up port-forward to service..."
    kubectl port-forward -n "$NAMESPACE" svc/$SERVICE_NAME 8080:80 &
    PF_PID=$!
    sleep 3
    SERVICE_URL="http://localhost:8080"
fi

# Start load test in background
echo "Starting Locust load test..."
bash "$(dirname "$0")/load-test.sh" &
LOAD_PID=$!

# Monitor scaling
echo ""
echo -e "${YELLOW}Step 4: Monitoring scaling behavior...${NC}"
echo "Watching replica count for $LOAD_DURATION (press Ctrl+C to stop early)"
echo ""

START_TIME=$(date +%s)
MAX_REPLICAS=$INITIAL_REPLICAS
SCALED_UP=false

while true; do
    CURRENT_REPLICAS=$(kubectl get deployment $SERVICE_NAME -n "$NAMESPACE" -o jsonpath='{.status.replicas}')
    READY_REPLICAS=$(kubectl get deployment $SERVICE_NAME -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')

    # Update max
    if [ "$CURRENT_REPLICAS" -gt "$MAX_REPLICAS" ]; then
        MAX_REPLICAS=$CURRENT_REPLICAS
    fi

    # Check if scaled up
    if [ "$CURRENT_REPLICAS" -ge "$EXPECTED_SCALE_UP" ]; then
        SCALED_UP=true
    fi

    # Show status
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    echo -e "$(date +%H:%M:%S) - Replicas: $CURRENT_REPLICAS ($READY_REPLICAS ready) | Max: $MAX_REPLICAS | Elapsed: ${ELAPSED}s"

    # Check if load test finished
    if ! kill -0 $LOAD_PID 2>/dev/null; then
        echo "Load test completed"
        break
    fi

    sleep 5
done

# Stop port-forward if running
if [ ! -z "$PF_PID" ]; then
    kill $PF_PID 2>/dev/null || true
fi

# Monitor scale down
echo ""
echo -e "${YELLOW}Step 5: Monitoring scale-down (cooldown period)...${NC}"
echo "Waiting for scale-down to minimum replicas..."

for i in {1..60}; do
    CURRENT_REPLICAS=$(kubectl get deployment $SERVICE_NAME -n "$NAMESPACE" -o jsonpath='{.status.replicas}')
    echo "$(date +%H:%M:%S) - Replicas: $CURRENT_REPLICAS"

    if [ "$CURRENT_REPLICAS" -le "$EXPECTED_MIN_REPLICAS" ]; then
        echo -e "${GREEN}Scaled down to minimum replicas${NC}"
        break
    fi

    sleep 5
done

# Results
echo ""
echo "=============================================="
echo -e "${BLUE}Autoscaling Test Results${NC}"
echo "=============================================="
echo "Initial replicas: $INITIAL_REPLICAS"
echo "Maximum replicas reached: $MAX_REPLICAS"
echo "Final replicas: $CURRENT_REPLICAS"
echo ""

# Evaluate results
PASSED=true

if [ "$MAX_REPLICAS" -ge "$EXPECTED_SCALE_UP" ]; then
    echo -e "${GREEN}✅ Scaled up successfully (reached $MAX_REPLICAS)${NC}"
else
    echo -e "${RED}❌ Did not scale up enough (max: $MAX_REPLICAS, expected: $EXPECTED_SCALE_UP+)${NC}"
    PASSED=false
fi

if [ "$CURRENT_REPLICAS" -le "$EXPECTED_MIN_REPLICAS" ]; then
    echo -e "${GREEN}✅ Scaled down to minimum replicas${NC}"
else
    echo -e "${YELLOW}⚠️  Still scaling down (current: $CURRENT_REPLICAS, expected: $EXPECTED_MIN_REPLICAS)${NC}"
fi

echo ""
if [ "$PASSED" = true ]; then
    echo -e "${GREEN}🎉 Autoscaling test PASSED!${NC}"
    exit 0
else
    echo -e "${RED}❌ Autoscaling test FAILED${NC}"
    echo "Check KEDA configuration and metrics"
    exit 1
fi
