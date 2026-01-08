#!/bin/bash
# Deploy upload-service to Kubernetes

set -e

echo "Deploying Upload Service to Kubernetes..."

# Configuration
NAMESPACE="${NAMESPACE:-default}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
SERVICE_NAME="upload-service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to infrastructure directory
cd "$(dirname "$0")/../infrastructure"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed or not in PATH${NC}"
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to Kubernetes cluster${NC}"
    exit 1
fi

echo -e "${YELLOW}Deploying to namespace: $NAMESPACE${NC}"
echo -e "${YELLOW}Image tag: $IMAGE_TAG${NC}"

# Apply K8s manifests
echo "Applying Kubernetes manifests..."
kubectl apply -k k8s/ -n "$NAMESPACE"

# Apply KEDA autoscaling
echo "Applying KEDA autoscaling configuration..."
kubectl apply -k keda/ -n "$NAMESPACE"

# Wait for rollout to complete
echo "Waiting for deployment rollout..."
kubectl rollout status deployment/$SERVICE_NAME -n "$NAMESPACE" --timeout=5m

# Verify deployment
echo "Verifying deployment..."
REPLICAS=$(kubectl get deployment $SERVICE_NAME -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')

if [ "$REPLICAS" -gt 0 ]; then
    echo -e "${GREEN}✅ Deployment successful! Running replicas: $REPLICAS${NC}"

    # Show pod status
    echo ""
    echo "Pod Status:"
    kubectl get pods -l app=$SERVICE_NAME -n "$NAMESPACE"

    # Show service endpoints
    echo ""
    echo "Service Endpoints:"
    kubectl get endpoints $SERVICE_NAME -n "$NAMESPACE"

    # Show ingress routes
    echo ""
    echo "Ingress Routes:"
    kubectl get ingressroute -l app=$SERVICE_NAME -n "$NAMESPACE" 2>/dev/null || echo "No IngressRoutes found"

    echo ""
    echo -e "${GREEN}Deployment complete!${NC}"
    echo "Check logs with: kubectl logs -f deployment/$SERVICE_NAME -n $NAMESPACE"
else
    echo -e "${RED}❌ Deployment failed. No ready replicas.${NC}"
    echo "Check pod status with: kubectl get pods -l app=$SERVICE_NAME -n $NAMESPACE"
    echo "Check events with: kubectl get events -n $NAMESPACE --sort-by='.lastTimestamp' | tail -20"
    exit 1
fi
